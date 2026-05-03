import * as React from 'react';

import { ReactNativeViewProps } from './ReactNative.types';

export default function ReactNativeView(props: ReactNativeViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
