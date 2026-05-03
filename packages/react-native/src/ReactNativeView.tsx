import { requireNativeView } from 'expo';
import * as React from 'react';

import { ReactNativeViewProps } from './ReactNative.types';

const NativeView: React.ComponentType<ReactNativeViewProps> =
  requireNativeView('ReactNative');

export default function ReactNativeView(props: ReactNativeViewProps) {
  return <NativeView {...props} />;
}
