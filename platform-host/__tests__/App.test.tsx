import React from 'react';
import Renderer from 'react-test-renderer';
import { Text } from 'react-native';
import App from '../App';
import { createNativeHost } from '../host/nativeHost';
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../host/nativeHost', () => ({ createNativeHost: jest.fn() }));
test('unconfigured native host shows an explicit environment state and never opens auth/storage/network', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(() => {
    tree = Renderer.create(<App />);
  });
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Среда ещё не настроена'),
  ).toBe(true);
  expect(createNativeHost).not.toHaveBeenCalled();
  await Renderer.act(() => tree.unmount());
});
