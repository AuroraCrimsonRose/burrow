import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ServerStackParamList } from './types';
import ServersScreen from '../screens/ServersScreen';
import ServerDetailScreen from '../screens/ServerDetailScreen';
import ChannelScreen from '../screens/ChannelScreen';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ServerStackParamList>();

export default function ServerStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="ServerList"
        component={ServersScreen}
        options={{ title: 'Servers' }}
      />
      <Stack.Screen
        name="ServerDetail"
        component={ServerDetailScreen}
        options={{ title: 'Server' }}
      />
      <Stack.Screen name="Channel" component={ChannelScreen} />
    </Stack.Navigator>
  );
}
