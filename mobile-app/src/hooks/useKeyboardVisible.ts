import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * iOS gets the `will` events so the compose bar moves with the animation
 * rather than a frame behind it; Android only has the `did` pair.
 */
const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

export const useKeyboardVisible = (): boolean => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW, () => setVisible(true));
    const hide = Keyboard.addListener(HIDE, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
};
