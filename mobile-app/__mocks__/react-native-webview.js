/**
 * `MapEmbed` is reached from `components/index.ts`, so ANY screen that imports
 * the barrel drags `react-native-webview` — and its TurboModule is not
 * registered in the Jest environment. Jest picks a root-level `__mocks__` entry
 * up automatically for node modules, so this needs no `jest.mock()` call.
 *
 * A plain `View` is enough: the only mobile WebView is the M7 map (§1.5), which
 * is `pointer-events:none` and carries no behaviour to assert.
 */
const React = require('react');
const {View} = require('react-native');

const WebView = React.forwardRef((props, ref) =>
  React.createElement(View, {...props, ref}),
);
WebView.displayName = 'WebView';

module.exports = {WebView, default: WebView, __esModule: true};
