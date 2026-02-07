class ScoreboardChannel < ApplicationCable::Channel
  ALLOWED_PAYLOAD_KEYS = %w[quarter period_seconds shot_seconds running shot_running matchup_index teams].freeze
  MAX_PAYLOAD_SIZE = 10_000

  def subscribed
    @match_id = params[:match_id].to_i
    unless authorized_for_match?(@match_id)
      reject
      return
    end
    stream_from(stream_name)
    transmit(type: "state", payload: ScoreboardStore.fetch(@match_id))
  end

  def update(data)
    payload = data["payload"]
    return if payload.blank?
    return unless valid_payload?(payload)

    ScoreboardStore.update(@match_id, payload)
    ActionCable.server.broadcast(stream_name, { type: "state", payload: payload })
  end

  def reset(data)
    payload = data["payload"]
    return if payload.blank?
    return unless valid_payload?(payload)

    ScoreboardStore.update(@match_id, payload)
    ActionCable.server.broadcast(stream_name, { type: "state", payload: payload })
  end

  private

  def stream_name
    "scoreboard:#{@match_id}"
  end

  def authorized_for_match?(match_id)
    current_user.clubs.joins(:matches).where(matches: { id: match_id }).exists?
  end

  def valid_payload?(payload)
    return false unless payload.is_a?(Hash)
    return false if payload.to_json.bytesize > MAX_PAYLOAD_SIZE
    payload.keys.all? { |key| ALLOWED_PAYLOAD_KEYS.include?(key) }
  end
end

class ScoreboardStore
  CACHE_PREFIX = "scoreboard_state_".freeze
  CACHE_EXPIRY = 24.hours

  class << self
    def fetch(match_id)
      Rails.cache.fetch(cache_key(match_id), expires_in: CACHE_EXPIRY) do
        default_state
      end
    end

    def update(match_id, payload)
      Rails.cache.write(cache_key(match_id), payload, expires_in: CACHE_EXPIRY)
    end

    def default_state
      {
        "quarter" => 1,
        "period_seconds" => 600,
        "shot_seconds" => 24,
        "running" => false,
        "shot_running" => false,
        "matchup_index" => 0,
        "teams" => []
      }
    end

    private

    def cache_key(match_id)
      "#{CACHE_PREFIX}#{match_id}"
    end
  end
end
