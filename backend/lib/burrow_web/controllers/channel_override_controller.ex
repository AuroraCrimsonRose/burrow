defmodule BurrowWeb.ChannelOverrideController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/channels/:channel_id/overrides
  def index(conn, %{"server_id" => server_id, "channel_id" => channel_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found} do
      overrides = Communities.list_channel_overrides(cid)
      json(conn, %{overrides: Enum.map(overrides, &override_json/1)})
    end
  end

  # PUT /api/v1/servers/:server_id/channels/:channel_id/overrides
  def upsert(conn, %{"server_id" => server_id, "channel_id" => channel_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    target_type = params["target_type"]
    target_id = parse_id(params["target_id"] || "0")
    allow = parse_int(params["allow"] || "0")
    deny = parse_int(params["deny"] || "0")

    with true <- valid_target_type?(target_type) || {:error, :bad_request},
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.manage_channels()) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         {:ok, override} <- Communities.set_channel_override(cid, target_type, target_id, allow, deny) do
      json(conn, override_json(override))
    end
  end

  # DELETE /api/v1/servers/:server_id/channels/:channel_id/overrides
  def delete(conn, %{"server_id" => server_id, "channel_id" => channel_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    target_type = params["target_type"]
    target_id = parse_id(params["target_id"] || "0")

    with true <- valid_target_type?(target_type) || {:error, :bad_request},
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.manage_channels()) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         {:ok, _} <- Communities.delete_channel_override(cid, target_type, target_id) do
      json(conn, %{ok: true})
    end
  end

  # POST /api/v1/servers/:server_id/categories/:category_id/sync_permissions
  def sync_category(conn, %{"server_id" => server_id, "category_id" => category_id, "channel_id" => source_channel_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cat_id = parse_id(category_id)
    source_id = parse_id(source_channel_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.manage_channels()) || {:error, :forbidden},
         {:ok, _category} <- Communities.get_category(cat_id),
         {:ok, source} <- Communities.get_channel(source_id),
         true <- source.server_id == sid || {:error, :not_found} do
      Communities.sync_category_permissions(cat_id, source_id)
      json(conn, %{ok: true})
    end
  end

  defp valid_target_type?(t), do: t in ~w(role user everyone)

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end
  defp parse_id(id) when is_integer(id), do: id

  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} -> n
      _ -> 0
    end
  end
  defp parse_int(val) when is_integer(val), do: val

  defp override_json(%{} = o) do
    %{
      id: to_string(o.id),
      channel_id: to_string(o.channel_id),
      target_type: o.target_type,
      target_id: to_string(o.target_id),
      allow: to_string(o.allow),
      deny: to_string(o.deny)
    }
  end
end
