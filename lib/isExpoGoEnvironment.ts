import Constants from 'expo-constants';

export function isExpoGoEnvironment(): boolean {
  return Constants.appOwnership === 'expo';
}
