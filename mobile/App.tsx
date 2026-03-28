import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/auth/AuthContext';
import { colors } from './src/theme/colors';

const BurrowTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.brandPrimary,
    background: colors.bgPrimary,
    card: colors.bgSecondary,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.brandPrimary,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    RPGAwesome: require('./assets/fonts/rpgawesome-webfont.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={BurrowTheme}>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
