defmodule BurrowWeb.MessageController do
  use BurrowWeb, :controller

  alias Burrow.Chat
  alias Burrow.Communities
  alias Burrow.Permissions
  alias Burrow.RateLimiter
  alias Burrow.Trust

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/channels/:channel_id/messages
  def index(conn, %{"server_id" => server_id, "channel_id" => channel_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.view_channel()) || {:error, :forbidden},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.read_message_history()) || {:error, :forbidden} do
      opts =
        []
        |> maybe_add(:before, params["before"])
        |> maybe_add(:after, params["after"])
        |> maybe_add(:limit, params["limit"])

      messages = Chat.list_messages(cid, opts)

      # Batch-lookup nicknames for all message authors
      author_ids = messages |> Enum.map(& &1.author_id) |> Enum.uniq()
      nicknames = Communities.get_member_nicknames(sid, author_ids)

      json(conn, %{messages: Enum.map(messages, &message_json(&1, nicknames))})
    end
  end

  # POST /api/v1/servers/:server_id/channels/:channel_id/messages
  def create(conn, %{"server_id" => server_id, "channel_id" => channel_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    with :ok <- Trust.can_send_message?(user_id),
         :ok <- check_message_rate(user_id, conn.assigns[:current_trust_tier] || 0, sid),
         true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         :ok <- check_not_timed_out(sid, user_id),
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.view_channel()) || {:error, :forbidden},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.send_messages()) || {:error, :forbidden} do
      content = Map.get(params, "content", "")
      attachments = Map.get(params, "attachments", [])

      has_content = is_binary(content) and content != ""
      has_attachments = is_list(attachments) and attachments != []

      if not has_content and not has_attachments do
        {:error, :bad_request}
      else
        with :ok <- if(has_content, do: check_embed_links(content, sid, user_id, cid), else: :ok),
             :ok <- if(has_content, do: check_mention_everyone(content, sid, user_id, cid), else: :ok),
             :ok <- if(has_content, do: check_no_links_if_tier0(content, conn.assigns[:current_trust_tier] || 0), else: :ok),
             {:ok, message} <- Chat.send_message(cid, user_id, Map.put_new(params, "content", "")) do
          nicknames = Communities.get_member_nicknames(sid, [user_id])
          conn
          |> put_status(:created)
          |> json(message_json(message, nicknames))
        else
          error -> error
        end
      end
    else
      :error -> {:error, :bad_request}
      error -> error
    end
  end

  # PATCH /api/v1/servers/:server_id/channels/:channel_id/messages/:id
  def update(conn, %{"server_id" => server_id, "channel_id" => channel_id, "id" => id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.view_channel()) || {:error, :forbidden},
         {:ok, content} when is_binary(content) <- Map.fetch(params, "content"),
         {:ok, message} <- Chat.edit_message(parse_id(id), user_id, content) do
      json(conn, message_json(message))
    else
      :error -> {:error, :bad_request}
      error -> error
    end
  end

  # DELETE /api/v1/servers/:server_id/channels/:channel_id/messages/:id
  def delete(conn, %{"server_id" => server_id, "channel_id" => channel_id, "id" => id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)
    can_manage = Communities.has_channel_permission?(sid, user_id, cid, Permissions.manage_messages())

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.view_channel()) || {:error, :forbidden},
         :ok <- Chat.delete_message(parse_id(id), user_id, can_manage: can_manage) do
      json(conn, %{status: "deleted"})
    end
  end

  # GET /api/v1/servers/:server_id/channels/:channel_id/messages/:id/edits
  def edits(conn, %{"server_id" => server_id, "channel_id" => channel_id, "id" => id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(cid),
         true <- channel.server_id == sid || {:error, :not_found},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.view_channel()) || {:error, :forbidden},
         true <- Communities.has_channel_permission?(sid, user_id, cid, Permissions.read_message_history()) || {:error, :forbidden} do
      edits = Chat.list_message_edits(parse_id(id))

      json(conn, %{edits: Enum.map(edits, &edit_json/1)})
    end
  end

  # GET /api/v1/servers/:server_id/messages/search?q=...
  def search(conn, %{"server_id" => server_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    query = params["q"] || ""

    with true <- String.length(query) >= 2 || {:error, :bad_request},
         true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      # Get all channels the user can read
      channels = Communities.list_channels(sid)

      readable_channel_ids =
        channels
        |> Enum.filter(fn ch ->
          Communities.has_channel_permission?(sid, user_id, ch.id, Permissions.view_channel()) &&
            Communities.has_channel_permission?(sid, user_id, ch.id, Permissions.read_message_history())
        end)
        |> Enum.map(& &1.id)

      opts =
        []
        |> maybe_add(:offset, params["offset"])
        |> maybe_add(:limit, params["limit"])
        |> maybe_add_author(params["author_id"])
        |> maybe_add_content_type(params["content_type"])
        |> maybe_add_date(:after_date, params["after"])
        |> maybe_add_date(:before_date, params["before"])

      {messages, total} = Chat.search_messages(readable_channel_ids, query, opts)

      json(conn, %{
        messages: Enum.map(messages, &message_json/1),
        total: total,
        offset: Keyword.get(opts, :offset, 0),
        limit: Keyword.get(opts, :limit, 25)
      })
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp maybe_add(opts, _key, nil), do: opts
  defp maybe_add(opts, key, val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} -> [{key, n} | opts]
      _ -> opts
    end
  end

  defp maybe_add_author(opts, nil), do: opts
  defp maybe_add_author(opts, val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} -> [{:author_id, n} | opts]
      _ -> opts
    end
  end

  defp maybe_add_content_type(opts, nil), do: opts
  defp maybe_add_content_type(opts, ct) when ct in ~w(message image video gif file), do: [{:content_type, ct} | opts]
  defp maybe_add_content_type(opts, _), do: opts

  defp maybe_add_date(opts, _key, nil), do: opts
  defp maybe_add_date(opts, key, val) when is_binary(val) do
    case DateTime.from_iso8601(val) do
      {:ok, dt, _} -> [{key, dt} | opts]
      _ ->
        case Date.from_iso8601(val) do
          {:ok, d} -> [{key, DateTime.new!(d, ~T[00:00:00], "Etc/UTC")} | opts]
          _ -> opts
        end
    end
  end

  defp message_json(%{} = msg, nicknames \\ %{}) do
    nickname = Map.get(nicknames, msg.author_id) || Map.get(nicknames, msg.author.id)
    display = nickname || msg.author.display_name || msg.author.username

    reactions =
      case msg do
        %{reactions: rs} when is_list(rs) ->
          rs
          |> Enum.group_by(& &1.emoji)
          |> Enum.map(fn {emoji, entries} ->
            %{emoji: emoji, userIds: Enum.map(entries, &to_string(&1.user_id))}
          end)
        _ -> []
      end

    %{
      id: to_string(msg.id),
      channel_id: to_string(msg.channel_id),
      author: %{
        id: to_string(msg.author.id),
        username: msg.author.username,
        display_name: display
      },
      content: msg.content,
      type: msg.type,
      reply_to_id: if(msg.reply_to_id, do: to_string(msg.reply_to_id)),
      edited_at: msg.edited_at,
      channel_seq: msg.channel_seq,
      timestamp: msg.inserted_at,
      reactions: reactions,
      attachments: enrich_attachments(msg.attachments || [])
    }
  end

  defp enrich_attachments(attachments) when is_list(attachments) do
    Enum.map(attachments, fn att ->
      key = att["key"] || att[:key]

      if is_binary(key) and key != "" do
        att =
          try do
            case Burrow.Storage.signed_url(key) do
              {:ok, url} -> Map.put(att, "url", url)
              _ -> att
            end
          rescue
            _ -> att
          end

        case Burrow.Uploads.get_by_key(key) do
          %{scan_status: ss, virus_result: vr, mime_verified: mv, expires_at: ea} ->
            att
            |> Map.put("scan_status", ss)
            |> Map.put("virus_result", vr)
            |> Map.put("mime_verified", mv)
            |> Map.put("expires_at", ea && DateTime.to_iso8601(ea))

          _ ->
            att
        end
      else
        att
      end
    end)
  end
  defp enrich_attachments(_), do: []

  defp check_message_rate(user_id, tier, server_id) do
    with {:ok, _, _} <- RateLimiter.check_user_message(user_id, tier),
         {:ok, _, _} <- RateLimiter.check_server_message(server_id) do
      :ok
    else
      {:error, retry_after, _limit} -> {:error, {:rate_limited, retry_after}}
    end
  end

  defp check_not_timed_out(server_id, user_id) do
    if Communities.timed_out?(server_id, user_id) do
      {:error, :timed_out}
    else
      :ok
    end
  end

  @url_pattern ~r{https?://}i
  defp check_no_links_if_tier0(_content, tier) when tier > 0, do: :ok
  defp check_no_links_if_tier0(content, 0) do
    if Regex.match?(@url_pattern, content),
      do: {:error, :links_not_allowed},
      else: :ok
  end

  defp edit_json(%{} = edit) do
    %{
      id: to_string(edit.id),
      message_id: to_string(edit.message_id),
      content_before: edit.content_before,
      edited_by: to_string(edit.edited_by),
      edited_at: edit.edited_at
    }
  end

  @link_pattern ~r{https?://}i
  defp check_embed_links(content, sid, user_id, cid) do
    if Regex.match?(@link_pattern, content) &&
         !Communities.has_channel_permission?(sid, user_id, cid, Permissions.embed_links()) do
      {:error, :embed_links_denied}
    else
      :ok
    end
  end

  @mention_everyone_pattern ~r{@everyone|@here}
  defp check_mention_everyone(content, sid, user_id, cid) do
    if Regex.match?(@mention_everyone_pattern, content) &&
         !Communities.has_channel_permission?(sid, user_id, cid, Permissions.mention_everyone()) do
      {:error, :mention_everyone_denied}
    else
      :ok
    end
  end
end
