defmodule BurrowWeb.NetworkController do
  use BurrowWeb, :controller

  alias Burrow.Communities

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/networks
  def index(conn, _params) do
    networks = Communities.list_user_networks(conn.assigns.current_user_id)
    json(conn, %{networks: Enum.map(networks, &network_json/1)})
  end

  # POST /api/v1/networks
  def create(conn, params) do
    owner_id = conn.assigns.current_user_id

    with {:ok, name} when is_binary(name) <- Map.fetch(params, "name"),
         server_ids when is_list(server_ids) <- Map.get(params, "server_ids", []),
         parsed_ids = Enum.map(server_ids, &parse_id/1),
         {:ok, network} <- Communities.create_network(owner_id, params, parsed_ids) do
      conn
      |> put_status(:created)
      |> json(network_json(network))
    else
      :error -> {:error, :bad_request}
      error -> error
    end
  end

  # PATCH /api/v1/networks/:id
  def update(conn, %{"id" => id} = params) do
    user_id = conn.assigns.current_user_id

    with {:ok, network} <- Communities.get_network(parse_id(id)),
         true <- network.owner_id == user_id || {:error, :forbidden},
         {:ok, updated} <- Communities.update_network(network, params) do
      json(conn, network_json(updated))
    end
  end

  # DELETE /api/v1/networks/:id
  def delete(conn, %{"id" => id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, network} <- Communities.get_network(parse_id(id)),
         true <- network.owner_id == user_id || {:error, :forbidden},
         {:ok, _} <- Communities.delete_network(network) do
      json(conn, %{status: "deleted"})
    end
  end

  # PUT /api/v1/networks/:id/servers/:server_id
  def add_server(conn, %{"id" => id, "server_id" => server_id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, network} <- Communities.get_network(parse_id(id)),
         true <- network.owner_id == user_id || {:error, :forbidden},
         :ok <- Communities.add_server_to_network(network.id, parse_id(server_id)) do
      {:ok, updated} = Communities.get_network(network.id)
      json(conn, network_json(updated))
    end
  end

  # DELETE /api/v1/networks/:id/servers/:server_id
  def remove_server(conn, %{"id" => id, "server_id" => server_id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, network} <- Communities.get_network(parse_id(id)),
         true <- network.owner_id == user_id || {:error, :forbidden},
         :ok <- Communities.remove_server_from_network(network.id, parse_id(server_id)) do
      {:ok, updated} = Communities.get_network(network.id)
      json(conn, network_json(updated))
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp parse_id(id) when is_integer(id), do: id

  defp network_json(%{} = network) do
    %{
      id: to_string(network.id),
      name: network.name,
      owner_id: to_string(network.owner_id),
      server_ids: network
        |> Map.get(:servers, [])
        |> case do
          %Ecto.Association.NotLoaded{} -> []
          servers -> Enum.map(servers, &to_string(&1.id))
        end
    }
  end
end
