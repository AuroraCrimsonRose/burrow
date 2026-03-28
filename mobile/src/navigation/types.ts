export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Recover: undefined;
  PairDevice: undefined;
};

export type MainTabParamList = {
  Servers: undefined;
  DMs: undefined;
  Friends: undefined;
  Settings: undefined;
};

export type ServerStackParamList = {
  ServerList: undefined;
  ServerDetail: { serverId: string; serverName: string };
  Channel: { serverId: string; channelId: string; channelName: string };
};

export type DMStackParamList = {
  DMList: undefined;
  DMChat: { dmId: string; recipientId: string; recipientName: string };
};
