class ScoreboardChannel < ApplicationCable::Channel
  ALLOWED_PAYLOAD_KEYS = %w[
    quarter period_seconds shot_seconds running shot_running matchup_index
    teams rotation_step home_fouls away_fouls matchup_scores matchup_order matchup_slots quarter_history possession
    manual_swap sound_enabled voice_enabled voice_rate base_possession possession_switch_pattern progression_mode
    quarter_score_reset_enabled regular_quarters state_version updated_at_ms source_client_id
    main_ref_at_ms main_ref_value shot_ref_at_ms shot_ref_value
  ].freeze
  MAX_PAYLOAD_SIZE = 50_000

  def subscribed
    @match_id = params[:match_id]
    unless authorized_for_match?(@match_id)
      reject
      return
    end
    stream_from(stream_name)
    transmit({
      type: "state",
      payload: ScoreboardStore.fetch(
        @match_id,
        period_seconds: current_user.default_period_seconds,
        voice_rate: current_user.voice_announcement_rate,
        possession_switch_pattern: current_user.possession_switch_pattern,
        regular_quarters: regular_quarters_for_match(@match_id)
      )
    })
  end

  def update(data)
    payload = sanitize_payload(data["payload"])
    return if payload.blank?

    ScoreboardStore.update(@match_id, payload)
    ActionCable.server.broadcast(stream_name, { type: "state", payload: payload })
  end

  def reset(data)
    payload = sanitize_payload(data["payload"])
    return if payload.blank?

    ScoreboardStore.update(@match_id, payload)
    ActionCable.server.broadcast(stream_name, { type: "state", payload: payload })
  end

  private

  def stream_name
    "scoreboard:#{@match_id}"
  end

  def authorized_for_match?(match_id)
    if match_id.to_s.start_with?("standalone_u")
      user_id = match_id.to_s.sub("standalone_u", "").to_i
      current_user.id == user_id
    elsif match_id.to_s.start_with?("standalone_") # Legacy or other
      club_id = match_id.to_s.split("_").last.to_i
      current_user.clubs.where(id: club_id).exists?
    else
      current_user.clubs.joins(:matches).where(matches: { id: match_id.to_i }).exists?
    end
  end

  def sanitize_payload(payload)
    return nil unless payload.is_a?(Hash)

    sanitized = payload.slice(*ALLOWED_PAYLOAD_KEYS)
    return nil if sanitized.blank?
    return nil if sanitized.to_json.bytesize > MAX_PAYLOAD_SIZE

    sanitized
  end

  def regular_quarters_for_match(match_id)
    return 4 if match_id.to_s.start_with?("standalone_")

    value = Match.where(id: match_id.to_i).pick(:regular_quarters).to_i
    [ 3, 4 ].include?(value) ? value : 4
  end
end

class ScoreboardStore
  CACHE_PREFIX = "scoreboard_state_".freeze
  CACHE_EXPIRY = 24.hours

  class << self
    def fetch(match_id, period_seconds: 480, voice_rate: User::DEFAULT_VOICE_ANNOUNCEMENT_RATE, possession_switch_pattern: User::DEFAULT_POSSESSION_SWITCH_PATTERN, regular_quarters: 4)
      Rails.cache.fetch(cache_key(match_id), expires_in: CACHE_EXPIRY) do
        default_state(
          period_seconds: period_seconds,
          voice_rate: voice_rate,
          possession_switch_pattern: possession_switch_pattern,
          regular_quarters: regular_quarters
        )
      end
    end

    def update(match_id, payload)
      Rails.cache.write(cache_key(match_id), payload, expires_in: CACHE_EXPIRY)
    end

    def delete(match_id)
      Rails.cache.delete(cache_key(match_id))
    end

    def default_state(period_seconds: 480, voice_rate: User::DEFAULT_VOICE_ANNOUNCEMENT_RATE, possession_switch_pattern: User::DEFAULT_POSSESSION_SWITCH_PATTERN, regular_quarters: 4)
      sanitized_period_seconds = period_seconds.to_i
      sanitized_period_seconds = 480 if sanitized_period_seconds <= 0
      sanitized_voice_rate = voice_rate.to_f.round(1)
      sanitized_voice_rate = User::DEFAULT_VOICE_ANNOUNCEMENT_RATE unless User::VOICE_ANNOUNCEMENT_RATES.include?(sanitized_voice_rate)
      sanitized_possession_switch_pattern =
        User::POSSESSION_SWITCH_PATTERNS.include?(possession_switch_pattern) ? possession_switch_pattern : User::DEFAULT_POSSESSION_SWITCH_PATTERN
      sanitized_regular_quarters = regular_quarters.to_i
      sanitized_regular_quarters = 4 unless [ 3, 4 ].include?(sanitized_regular_quarters)

      {
        "quarter" => 1,
        "regular_quarters" => sanitized_regular_quarters,
        "period_seconds" => sanitized_period_seconds,
        "shot_seconds" => 24,
        "running" => false,
        "shot_running" => false,
        "matchup_index" => 0,
        "rotation_step" => 0,
        "home_fouls" => 0,
        "away_fouls" => 0,
        "teams" => [],
        "matchup_slots" => [],
        "matchup_scores" => [
          { "team1" => 0, "team2" => 0 },
          { "team1" => 0, "team2" => 0 },
          { "team1" => 0, "team2" => 0 }
        ],
        "matchup_order" => [],
        "quarter_history" => {},
        "possession" => "home",
        "base_possession" => "home",
        "possession_switch_pattern" => sanitized_possession_switch_pattern,
        "progression_mode" => "by_quarter",
        "manual_swap" => false,
        "quarter_score_reset_enabled" => sanitized_regular_quarters == 3,
        "sound_enabled" => true,
        "voice_enabled" => true,
        "voice_rate" => sanitized_voice_rate,
        "state_version" => 0,
        "updated_at_ms" => 0,
        "source_client_id" => nil,
        "main_ref_at_ms" => 0,
        "main_ref_value" => sanitized_period_seconds,
        "shot_ref_at_ms" => 0,
        "shot_ref_value" => 24
      }
    end

    private

    def cache_key(match_id)
      "#{CACHE_PREFIX}#{match_id}"
    end
  end
end
