/**
 * The §6.1 invariants exercised THROUGH THE SCREENS.
 *
 * `jobStateMachine.test.ts` proves the machine is right. This file proves the
 * capture flow actually routes through it — that no screen quietly re-decides
 * a gate, and that a rejected transition is visible to the driver rather than
 * swallowed. A green machine behind a screen that ignores it is the failure
 * mode this file exists to catch.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CaptureStepScreen,
  PreTripInspectionScreen,
} from '../src/features/capture';
import { jobsRepo } from '../src/data/mock';
import type { DriverJobsRepo, EvidenceStep } from '../src/data/contracts';
import { db } from '../src/data/mock/db';
import { INSPECTION_ITEMS } from '../src/data/jobStateMachine';
import { customerEmails } from '../src/data/mock/jobs';

const JOB = 'A3-0421';
const URI = 'file:///mock/shot.jpg';

/**
 * Every repo call sleeps 200–400ms on purpose (§2.3 — a synchronous mock makes
 * every loading state dead code). Walking the whole closeout is ~25 of them,
 * so the ceiling is raised here rather than the mock made unrealistic.
 */
jest.setTimeout(60_000);

// The picker is a native module; the flow under test is what happens AFTER a
// shot exists, so it always yields one.
jest.mock('../src/features/capture/pickPhoto', () => ({
  pickPhoto: () => Promise.resolve('file:///mock/shot.jpg'),
  pickFromLibrary: () => Promise.resolve('file:///mock/shot.jpg'),
}));

const INSETS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const nav = { navigate: jest.fn(), goBack: jest.fn() };

type CaptureProps = React.ComponentProps<typeof CaptureStepScreen>;
type PretripProps = React.ComponentProps<typeof PreTripInspectionScreen>;

/**
 * A screen rendered outside its navigator gets the two props it actually
 * reads. `NativeStackScreenProps` carries ~30 navigator internals none of
 * these screens touch, so the cast is narrower than a full fake would be.
 */
const props = <P,>(name: string): P =>
  ({
    navigation: nav,
    route: { key: name, name, params: { jobId: JOB } },
  } as unknown as P);

const draw = (element: React.JSX.Element) =>
  render(
    <SafeAreaProvider initialMetrics={INSETS}>
      <NavigationContainer>{element}</NavigationContainer>
    </SafeAreaProvider>,
  );

/** Reset the one mutable job between tests — the mock store is a singleton. */
const original = JSON.parse(
  JSON.stringify(db.jobs.find(j => j.id === JOB)),
) as (typeof db.jobs)[number];

beforeEach(() => {
  nav.navigate.mockClear();
  const i = db.jobs.findIndex(j => j.id === JOB);
  db.jobs[i] = JSON.parse(JSON.stringify(original));
});

const fill = async (step: EvidenceStep, count: number): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await jobsRepo.capturePhoto(JOB, step, i, URI);
  }
};

/**
 * The only door into ② is 12/12. Nothing may `.catch()` past this: a swallowed
 * `advance` would leave the job on ① and quietly test the wrong screen.
 */
const passPretrip = async (): Promise<void> => {
  for (const item of INSPECTION_ITEMS) {
    await jobsRepo.setInspectionItem(JOB, item.id, 'pass');
  }
  await jobsRepo.advance(JOB, 'pretrip');
};

describe('M19 — a defect with no note is rejected at the point of interaction', () => {
  it('never commits the ✗, surfaces the refusal, and keeps Report locked', async () => {
    draw(
      <PreTripInspectionScreen {...props<PretripProps>('PreTripInspection')} />,
    );
    await screen.findByText('Service brakes & parking brake');

    fireEvent.press(screen.getByLabelText('Air / hydraulic lines: defect'));

    // The note docks immediately — the row READS as a defect before it commits.
    const note = await screen.findByLabelText(
      'Defect note for Air / hydraulic lines',
    );
    expect(screen.getByLabelText('Report defect to dispatch')).toBeDisabled();
    expect(
      screen.getByText('Describe the defect before you can report it'),
    ).toBeVisible();

    // Blurring an empty note asks the machine to commit it. It refuses.
    fireEvent(note, 'blur');
    await waitFor(() =>
      expect(
        screen.getByText(
          'A defect needs a note describing it before it can be reported.',
        ),
      ).toBeVisible(),
    );

    // Nothing reached the store, and the job is still PENDING, not BLOCKED.
    const job = await jobsRepo.get(JOB);
    expect(
      job?.inspection?.items.find(i => i.id === 'lines')?.result ?? null,
    ).toBeNull();
    expect(job?.status).toBe('pending');

    // Once described, the same blur commits and the CTA unlocks.
    fireEvent.changeText(note, 'Leak at glad hand — will not hold air.');
    fireEvent(note, 'blur');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Report defect to dispatch'),
      ).not.toBeDisabled(),
    );
  });

  it('blocks the job AND flags the unit out of service through the fleet mock', async () => {
    draw(
      <PreTripInspectionScreen {...props<PretripProps>('PreTripInspection')} />,
    );
    await screen.findByText('Horn');

    fireEvent.press(screen.getByLabelText('Air / hydraulic lines: defect'));
    const note = await screen.findByLabelText(
      'Defect note for Air / hydraulic lines',
    );
    fireEvent.changeText(note, 'Leak at glad hand — will not hold air.');
    fireEvent(note, 'blur');

    await waitFor(() =>
      expect(
        screen.getByLabelText('Report defect to dispatch'),
      ).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByLabelText('Report defect to dispatch'));

    await waitFor(async () => {
      expect((await jobsRepo.get(JOB))?.status).toBe('blocked');
    });
    // Not a screen-local flag: the fleet record and the dispatch alert moved.
    const unit = db.units.find(u => u.id === original.truckId);
    expect(unit?.outOfService).toBe(true);
    expect(db.defects.some(d => d.jobId === JOB)).toBe(true);
    expect(db.notifications.some(n => n.kind === 'unit_out_of_service')).toBe(
      true,
    );
  });
});

describe('M20 — deleting a photo re-opens the step', () => {
  it('re-locks the visible CTA and blanks only that slot', async () => {
    await passPretrip();
    await fill('pickup', 2);

    draw(<CaptureStepScreen {...props<CaptureProps>('ConfirmPickup')} />);
    await screen.findByText('Pickup photos · 2 of 2');
    expect(screen.getByLabelText('Confirm pickup')).not.toBeDisabled();

    fireEvent.press(screen.getByLabelText('Delete photo: 2 · Seal in hand'));
    // Never one tap: the sheet says what deleting costs before it happens.
    expect(
      await screen.findByText(
        'Removing it re-opens this step — you can’t confirm pickup until it is retaken.',
      ),
    ).toBeVisible();
    fireEvent.press(screen.getByLabelText('Delete photo'));

    await screen.findByText('Pickup photos · 1 of 2');
    const cta = screen.getByLabelText('Confirm pickup');
    // Locked, NOT hidden — and it says how many shots are outstanding.
    expect(cta).toBeVisible();
    expect(cta).toBeDisabled();
    expect(screen.getByText('1 photo still to capture')).toBeVisible();
  });

  it('re-locks when the seal number is cleared (§8 Q1)', async () => {
    await passPretrip();
    await fill('pickup', 2);

    draw(<CaptureStepScreen {...props<CaptureProps>('ConfirmPickup')} />);
    await screen.findByText('Pickup photos · 2 of 2');

    fireEvent.changeText(screen.getByLabelText('Seal no.'), '');
    expect(screen.getByLabelText('Confirm pickup')).toBeDisabled();
    expect(
      screen.getByText('Enter the seal number to confirm pickup'),
    ).toBeVisible();

    fireEvent.changeText(screen.getByLabelText('Seal no.'), 'SL-778142');
    expect(screen.getByLabelText('Confirm pickup')).not.toBeDisabled();
  });
});

describe('a slot in flight says so', () => {
  it('holds the picked shot under a busy state until the upload lands', async () => {
    await passPretrip();

    // The fixtures resolve instantly, so the transfer is held open here — on a
    // real connection it is a presign, an upload and a POST, and that gap is
    // the whole point of the state under test.
    let land: (job: Awaited<ReturnType<typeof jobsRepo.get>>) => void = () => {};
    const real = jobsRepo.capturePhoto.bind(jobsRepo);
    const spy = jest
      .spyOn(jobsRepo, 'capturePhoto')
      .mockImplementation(async (...args) => {
        const job = await real(...args);
        await new Promise<void>(resolve => {
          land = () => resolve();
        });
        return job;
      });

    try {
      draw(<CaptureStepScreen {...props<CaptureProps>('ConfirmPickup')} />);
      await screen.findByText('Pickup photos · 0 of 2');

      fireEvent.press(
        screen.getByLabelText('1 · Chassis + container no., tap to capture'),
      );

      // Says it is working, rather than looking like a tap that missed.
      const busy = await screen.findByLabelText(
        '1 · Chassis + container no., uploading',
      );
      // ...and refuses a second pick that would race the first.
      fireEvent.press(busy);

      land(null);
      await screen.findByLabelText('1 · Chassis + container no., captured');
      await screen.findByText('Pickup photos · 1 of 2');

      // Exactly one photo landed, despite the press while busy.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('M22 — Submit stays visible and locked until both slots are filled', () => {
  it('shows the lock, the count, and every slot by its own label', async () => {
    await passPretrip();
    await fill('pickup', 2);
    await jobsRepo.advance(JOB, 'pickup');
    await fill('load', 3);
    await jobsRepo.advance(JOB, 'load');
    await fill('delivery', 1);

    draw(<CaptureStepScreen {...props<CaptureProps>('ConfirmDelivery')} />);
    await screen.findByText('Delivery photos · 1 of 2');

    const cta = screen.getByLabelText('Submit for approval');
    expect(cta).toBeVisible();
    expect(cta).toBeDisabled();
    expect(screen.getByText('1 photo still to capture')).toBeVisible();

    // Labelled slots, never an anonymous grid — the office must see WHICH one.
    expect(screen.getByText('1 · J1 ticket')).toBeVisible();
    expect(screen.getByText('2 · Chassis return ticket')).toBeVisible();

    // The last shot unlocks it, and only then.
    fireEvent.press(
      screen.getByLabelText('2 · Chassis return ticket, tap to capture'),
    );
    await screen.findByText('Delivery photos · 2 of 2');
    expect(screen.getByLabelText('Submit for approval')).not.toBeDisabled();
  });

  it('only the J1 ticket may be uploaded rather than shot', async () => {
    const job = await jobsRepo.get(JOB);
    // Evidence is shot at the place it is claimed. The J1 ticket is the one
    // exception, because the terminal hands it over as a document.
    expect(job?.evidence.delivery[0]?.label).toBe('1 · J1 ticket');
    expect(job?.evidence.delivery[0]?.allowUpload).toBe(true);
    expect(job?.evidence.delivery[1]?.allowUpload).toBe(false);
    for (const slot of [
      ...(job?.evidence.pickup ?? []),
      ...(job?.evidence.load ?? []),
    ]) {
      expect(slot.allowUpload).toBe(false);
    }
  });
});

describe('a driver can never set DONE', () => {
  it('submit lands on AWAITING APPROVAL and fires the customer email there', async () => {
    await passPretrip();
    await fill('pickup', 2);
    await jobsRepo.advance(JOB, 'pickup');
    await fill('load', 3);
    await jobsRepo.advance(JOB, 'load');
    await fill('delivery', 2);

    const before = customerEmails.length;

    draw(<CaptureStepScreen {...props<CaptureProps>('ConfirmDelivery')} />);
    await screen.findByText('Delivery photos · 2 of 2');
    fireEvent.press(screen.getByLabelText('Submit for approval'));

    await waitFor(() =>
      expect(nav.navigate).toHaveBeenCalledWith('Submitted', { jobId: JOB }),
    );
    const job = await jobsRepo.get(JOB);
    expect(job?.status).toBe('awaiting_approval');
    expect(job?.status).not.toBe('done');
    // §6.8 — the email fires on driver SUBMIT, not on admin approval.
    expect(customerEmails.length).toBe(before + 1);
  });

  it('has no repo method that could produce DONE', () => {
    // The type surface is the enforcement; this asserts the runtime shape
    // matches it, so an accidental `approve` on the mock fails here.
    const surface = Object.keys(jobsRepo) as (keyof DriverJobsRepo)[];
    expect(surface).not.toContain('approve');
    expect(surface).not.toContain('setStatus');
    expect(surface).toContain('submit');
  });
});
