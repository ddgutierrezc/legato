import { registerWebModule, NativeModule } from 'expo';

import { ReactNativeModuleEvents } from './ReactNative.types';

class ReactNativeModule extends NativeModule<ReactNativeModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ReactNativeModule, 'ReactNativeModule');
