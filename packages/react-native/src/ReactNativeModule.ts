import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativeModuleEvents } from './ReactNative.types';

declare class ReactNativeModule extends NativeModule<ReactNativeModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ReactNativeModule>('ReactNative');
