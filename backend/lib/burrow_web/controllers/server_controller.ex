defmodule BurrowWeb.ServerController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Trust
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # POST /api/v1/servers
  def create(conn, params) do
    owner_id = conn.assigns.current_user_id

    with {:ok, name} when is_binary(name) <- Map.fetch(params, "name"),
         :ok <- Trust.can_create_server?(owner_id),
         :ok <- Communities.can_create_server?(owner_id),
         {:ok, server} <- Communities.create_server(owner_id, params) do
      conn
      |> put_status(:created)
      |> json(server_json(server))
    else
      :error -> {:error, :bad_request}
      {:error, :server_limit_reached} ->
        conn |> put_status(:forbidden) |> json(%{error: "You have reached the maximum of 100 burrows"})
      error -> error
    end
  end

  # GET /api/v1/servers
  def index(conn, _params) do
    servers = Communities.list_user_servers(conn.assigns.current_user_id)
    json(conn, %{servers: Enum.map(servers, &server_json/1)})
  end

  # GET /api/v1/servers/:id
  def show(conn, %{"id" => id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, server} <- Communities.get_server(parse_id(id)),
         true <- Communities.member?(server.id, user_id) || {:error, :forbidden} do
      json(conn, server_json(server))
    end
  end

  # PATCH /api/v1/servers/:id
  def update(conn, %{"id" => id} = params) do
    user_id = conn.assigns.current_user_id

    with {:ok, server} <- Communities.get_server(parse_id(id)),
         true <- Communities.has_permission?(server.id, user_id, Permissions.manage_server()) || {:error, :forbidden},
         {:ok, updated} <- Communities.update_server(server, params) do
      json(conn, server_json(updated))
    end
  end

  # DELETE /api/v1/servers/:id
  def delete(conn, %{"id" => id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, server} <- Communities.get_server(parse_id(id)),
         true <- Communities.owner?(server, user_id) || {:error, :forbidden},
         {:ok, _} <- Communities.delete_server(server) do
      json(conn, %{status: "deleted"})
    end
  end

  # POST /api/v1/servers/:id/transfer
  def transfer(conn, %{"id" => id, "new_owner_id" => new_owner_id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, server} <- Communities.get_server(parse_id(id)),
         true <- Communities.owner?(server, user_id) || {:error, :forbidden},
         {:ok, updated} <- Communities.transfer_ownership(server, parse_id(new_owner_id)) do
      json(conn, server_json(updated))
    else
      {:error, :not_a_member} ->
        conn |> put_status(:bad_request) |> json(%{error: "Target user is not a member of this server"})
      error -> error
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp server_json(%{} = server) do
    base = %{
      id: to_string(server.id),
      name: server.name,
      description: server.description,
      icon_url: server.icon_url,
      banner_url: server.banner_url,
      owner_id: to_string(server.owner_id)
    }

    case Map.get(server, :channels) do
      %Ecto.Association.NotLoaded{} -> base
      nil -> base
      channels when is_list(channels) ->
        Map.put(base, :channels, Enum.map(channels, fn c ->
          %{
            id: to_string(c.id),
            name: c.name,
            type: c.type,
            position: c.position
          }
        end))
    end
  end
end
