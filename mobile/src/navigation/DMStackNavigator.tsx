import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DMStackParamList } from './types';
import DMListScreen from '../screens/DMListScreen';
import DMChatScreen from '../screens/DMChatScreen';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<DMStackParamList>();

export default function DMStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="DMList"
        component={DMListScreen}
        options={{ title: 'Messages' }}
      />
      <Stack.Screen name="DMChat" component={DMChatScreen} />
    </Stack.Navigator>
  );
}
