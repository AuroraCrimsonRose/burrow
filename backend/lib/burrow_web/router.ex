defmodule BurrowWeb.Router do
  use BurrowWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug :accepts, ["json"]
    plug BurrowWeb.AuthPlug
    plug BurrowWeb.ReplayGuardPlug
    plug BurrowWeb.RequestSignaturePlug
    plug BurrowWeb.RateLimitPlug
  end

  pipeline :ip_auth do
    plug :accepts, ["json"]
    plug BurrowWeb.IpRateLimitPlug, action: :auth
  end

  pipeline :ip_creation do
    plug :accepts, ["json"]
    plug BurrowWeb.IpRateLimitPlug, action: :creation
  end

  # -- Public auth endpoints (no session required) --
  scope "/api/v1/auth", BurrowWeb do
    pipe_through :ip_creation
    post "/register", AuthController, :register
    post "/webauthn/register/begin", AuthController, :webauthn_register_begin
    post "/webauthn/register/complete", AuthController, :webauthn_register_complete
  end

  scope "/api/v1/auth", BurrowWeb do
    pipe_through :ip_auth

    post "/challenge", AuthController, :create_challenge
    post "/verify", AuthController, :verify_challenge
    post "/recover", AuthController, :recover
    post "/webauthn/login/begin", AuthController, :webauthn_login_begin
    post "/webauthn/login/complete", AuthController, :webauthn_login_complete
    post "/pairing/claim", AuthController, :claim_pairing
  end

  # -- Authenticated endpoints --
  scope "/api/v1/auth", BurrowWeb do
    pipe_through :authenticated

    get "/sessions", AuthController, :list_sessions
    delete "/sessions", AuthController, :revoke_other_sessions
    delete "/sessions/:id", AuthController, :revoke_session
    patch "/username", AuthController, :change_username
    post "/avatar", AvatarController, :upload
    get "/profile", AuthController, :get_profile
    patch "/profile", AuthController, :update_profile
    post "/recovery-key", AuthController, :generate_recovery_key
    post "/recovery-key/confirm", AuthController, :confirm_recovery_key
    get "/passkeys", AuthController, :list_passkeys
    delete "/passkeys/:id", AuthController, :revoke_passkey
    patch "/passkeys/:id", AuthController, :rename_passkey
    post "/passkeys/add/begin", AuthController, :passkey_add_begin
    post "/passkeys/add/complete", AuthController, :passkey_add_complete
    post "/pairing", AuthController, :create_pairing
    get "/pairing/:id", AuthController, :pairing_status
    get "/tos-status", AuthController, :tos_status
    post "/accept-terms", AuthController, :accept_terms
    post "/nsfw-verify", AuthController, :verify_nsfw_age
    get "/me", AuthController, :get_me
  end

  # -- File uploads --
  scope "/api/v1", BurrowWeb do
    pipe_through :authenticated

    post "/uploads", UploadController, :create
    post "/uploads/presign", UploadController, :presign
    get "/uploads/signed-url", UploadController, :signed_url
    get "/uploads/scan-status", UploadController, :scan_status

    # Chunked uploads (S3 multipart, Cloudflare-safe)
    post "/uploads/chunked/init", ChunkedUploadController, :init_upload
    put "/uploads/chunked/:upload_id/:part_number", ChunkedUploadController, :upload_chunk
    post "/uploads/chunked/:upload_id/complete", ChunkedUploadController, :complete
  end

  # -- Servers --
  scope "/api/v1", BurrowWeb do
    pipe_through :authenticated

    resources "/servers", ServerController, only: [:index, :create, :show, :update, :delete]
    post "/servers/:id/transfer", ServerController, :transfer

    # Networks (user-owned groupings of servers)
    resources "/networks", NetworkController, only: [:index, :create, :update, :delete]
    put "/networks/:id/servers/:server_id", NetworkController, :add_server
    delete "/networks/:id/servers/:server_id", NetworkController, :remove_server

    # Analytics
    get "/analytics/topology", AnalyticsController, :topology

    # Platform stats
    get "/stats/platform", StatsController, :platform

    # Badges
    get "/badges", BadgeController, :index
    put "/badges/primary", BadgeController, :set_primary
    delete "/badges/primary", BadgeController, :clear_primary
    post "/badges/grant", BadgeController, :grant
    post "/badges/revoke", BadgeController, :revoke
    post "/badges/release-ancient", BadgeController, :release_ancient

    # Admin (dev-only)
    post "/admin/set-dev", BadgeController, :set_dev

    # Nested under server
    scope "/servers/:server_id" do
      # Mark entire server as read
      post "/ack", ReadStateController, :ack_server

      resources "/channels", ChannelController, only: [:index, :create, :update, :delete]
      get "/categories", CategoryController, :index
      post "/categories", CategoryController, :create
      patch "/categories/:id", CategoryController, :update
      delete "/categories/:id", CategoryController, :delete
      post "/categories/:category_id/sync_permissions", ChannelOverrideController, :sync_category
      resources "/members", MemberController, only: [:index], param: "user_id"
      delete "/members/:user_id", MemberController, :delete
      patch "/members/@me", MemberController, :update_profile
      patch "/members/:user_id/nickname", MemberController, :update_nickname
      get "/permissions", MemberController, :my_permissions
      resources "/invites", InviteController, only: [:index, :create], param: "code"
      delete "/invites/:code", InviteController, :delete

      # Roles
      patch "/roles/reorder", RoleController, :reorder
      resources "/roles", RoleController, only: [:index, :create, :update, :delete]
      put "/members/:member_user_id/roles/:role_id", RoleController, :assign
      delete "/members/:member_user_id/roles/:role_id", RoleController, :unassign

      # Bans
      get "/bans", BanController, :index
      post "/bans", BanController, :create
      delete "/bans/:user_id", BanController, :delete

      # Timeouts
      post "/timeouts", BanController, :timeout
      delete "/timeouts/:user_id", BanController, :remove_timeout

      # Message search (server-wide)
      get "/messages/search", MessageController, :search

      # Messages
      scope "/channels/:channel_id" do
        resources "/messages", MessageController, only: [:index, :create, :update, :delete]
        get "/messages/:id/edits", MessageController, :edits

        # Channel permission overrides
        get "/overrides", ChannelOverrideController, :index
        put "/overrides", ChannelOverrideController, :upsert
        delete "/overrides", ChannelOverrideController, :delete

        # Read state (mark as read)
        post "/ack", ReadStateController, :ack

        # Reactions
        get "/messages/:message_id/reactions", ReactionController, :index
        put "/messages/:message_id/reactions/:emoji", ReactionController, :add
        delete "/messages/:message_id/reactions/:emoji", ReactionController, :remove

        # Pins
        get "/pins", PinController, :index
        post "/pins", PinController, :create
        delete "/pins/:message_id", PinController, :delete
      end

      # Server member presence (poll)
      get "/presence", PresenceController, :server_presence
    end

    # Invite accept (not nested under a server — user may not know server_id)
    post "/invites/:code/accept", InviteController, :accept

    # Trust
    get "/trust", TrustController, :show
    post "/trust/recalculate", TrustController, :recalculate

    # User profiles & notes
    get "/users/:id/profile", ProfileController, :show
    get "/users/:id/note", ProfileController, :get_note
    put "/users/:id/note", ProfileController, :set_note
    delete "/users/:id/note", ProfileController, :delete_note

    # Friends
    get "/friends", FriendController, :index
    get "/friends/requests", FriendController, :requests
    get "/friends/blocked", FriendController, :blocked
    post "/friends/request", FriendController, :send_request
    post "/friends/:user_id/accept", FriendController, :accept
    post "/friends/:user_id/decline", FriendController, :decline
    delete "/friends/:user_id", FriendController, :delete
    post "/friends/:user_id/block", FriendController, :block
    delete "/friends/:user_id/block", FriendController, :unblock

    # Presence (poll endpoints)
    get "/friends/presence", PresenceController, :friend_presence

    # Direct Messages
    get "/dms", DmController, :index
    post "/dms", DmController, :create
    get "/dms/:id/messages", DmController, :messages
    post "/dms/:id/messages", DmController, :send_message
    patch "/dms/:id/messages/:message_id", DmController, :edit_message
    delete "/dms/:id/messages/:message_id", DmController, :delete_message
    post "/dms/:id/ack", ReadStateController, :ack_dm

    # Read States
    get "/users/@me/read-states", ReadStateController, :index
  end

  # Prometheus metrics endpoint
  scope "/api/v1", BurrowWeb do
    pipe_through :api
    get "/metrics", MetricsController, :index
  end

  # Catch-all for unmatched API routes — return JSON 404 instead of HTML debug page
  scope "/api", BurrowWeb do
    pipe_through :api
    match :*, "/*path", CatchAllController, :not_found
  end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:burrow, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: BurrowWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
