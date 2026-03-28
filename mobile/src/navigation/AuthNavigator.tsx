import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import RecoverScreen from '../screens/RecoverScreen';
import PairDeviceScreen from '../screens/PairDeviceScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Recover" component={RecoverScreen} />
      <Stack.Screen name="PairDevice" component={PairDeviceScreen} />
    </Stack.Navigator>
  );
}
