defmodule BurrowWeb.CategoryController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/categories
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      categories = Communities.list_categories(sid)
      channels = Communities.list_channels(sid)

      json(conn, %{
        categories:
          Enum.map(categories, fn cat ->
            cat_channels =
              channels
              |> Enum.filter(&(&1.category_id == cat.id))
              |> Enum.sort_by(& &1.position)

            category_json(cat, cat_channels)
          end),
        uncategorized:
          channels
          |> Enum.filter(&is_nil(&1.category_id))
          |> Enum.sort_by(& &1.position)
          |> Enum.map(&channel_json/1)
      })
    end
  end

  # POST /api/v1/servers/:server_id/categories
  def create(conn, %{"server_id" => server_id, "name" => name}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.create_categories()) || {:error, :forbidden},
         {:ok, category} <- Communities.create_category(sid, %{"name" => name}) do
      conn
      |> put_status(:created)
      |> json(%{category: category_json(category, [])})
    end
  end

  # DELETE /api/v1/servers/:server_id/categories/:id
  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.delete_categories()) || {:error, :forbidden},
         {:ok, category} <- Communities.get_category(cid),
         true <- category.server_id == sid || {:error, :not_found},
         {:ok, _} <- Communities.delete_category(category) do
      json(conn, %{ok: true})
    end
  end

  # PATCH /api/v1/servers/:server_id/categories/:id
  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_categories()) || {:error, :forbidden},
         {:ok, category} <- Communities.get_category(cid),
         true <- category.server_id == sid || {:error, :not_found},
         {:ok, updated} <- Communities.update_category(category, Map.take(params, ["name"])) do
      json(conn, %{category: category_json(updated, [])})
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp category_json(%{} = cat, channels) do
    %{
      id: to_string(cat.id),
      name: cat.name,
      position: cat.position,
      channels: Enum.map(channels, &channel_json/1)
    }
  end

  defp channel_json(%{} = ch) do
    %{
      id: to_string(ch.id),
      server_id: to_string(ch.server_id),
      category_id: if(ch.category_id, do: to_string(ch.category_id)),
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: ch.position,
      nsfw: ch.nsfw,
      slow_mode_interval: ch.slow_mode_interval,
      last_seq: ch.last_seq || 0
    }
  end
end
