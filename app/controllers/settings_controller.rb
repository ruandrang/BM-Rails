class SettingsController < ApplicationController
  def show
    @user = current_user
  end

  def update
    @user = current_user
    minutes = normalized_default_game_minutes
    announcements_enabled = normalized_announcements_enabled
    voice_rate = normalized_voice_announcement_rate(
      setting_params[:voice_announcement_rate],
      default: @user.voice_announcement_rate
    )
    possession_switch_pattern = normalized_possession_switch_pattern(
      setting_params[:possession_switch_pattern],
      default: @user.possession_switch_pattern
    )

    unless minutes
      @user.assign_attributes(setting_params.except(:announcements_enabled))
      @user.errors.add(:default_game_minutes, "는 #{User::MIN_GAME_MINUTES}~#{User::MAX_GAME_MINUTES}분 사이여야 합니다.")
      render :show, status: :unprocessable_entity
      return
    end

    @user.update_columns(
      default_game_minutes: minutes,
      scoreboard_sound_enabled: announcements_enabled,
      voice_announcement_enabled: announcements_enabled,
      voice_announcement_rate: voice_rate,
      possession_switch_pattern: possession_switch_pattern,
      updated_at: Time.current
    )
    clear_scoreboard_state_cache!
    redirect_to setting_path, notice: "세팅이 저장되었습니다."
  end

  private

  def setting_params
    params.require(:user).permit(
      :default_game_minutes,
      :announcements_enabled,
      :scoreboard_sound_enabled,
      :voice_announcement_enabled,
      :voice_announcement_rate,
      :possession_switch_pattern
    )
  end

  def clear_scoreboard_state_cache!
    match_ids = current_user.clubs.joins(:matches).pluck("matches.id")
    match_ids.each { |match_id| Rails.cache.delete(scoreboard_cache_key(match_id)) }
    Rails.cache.delete(scoreboard_cache_key("standalone_u#{current_user.id}"))
  end

  def scoreboard_cache_key(match_id)
    "scoreboard_state_#{match_id}"
  end

  def normalized_default_game_minutes
    raw = setting_params[:default_game_minutes]
    return nil if raw.blank?

    minutes = raw.to_i
    return nil unless minutes.between?(User::MIN_GAME_MINUTES, User::MAX_GAME_MINUTES)

    minutes
  end

  def normalized_boolean(value, default:)
    return default if value.nil?

    casted = ActiveModel::Type::Boolean.new.cast(value)
    casted.nil? ? default : casted
  end

  def normalized_announcements_enabled
    default = @user.scoreboard_sound_enabled && @user.voice_announcement_enabled

    if setting_params.key?(:announcements_enabled)
      return normalized_boolean(setting_params[:announcements_enabled], default: default)
    end

    sound_param = setting_params[:scoreboard_sound_enabled]
    voice_param = setting_params[:voice_announcement_enabled]

    return default if sound_param.nil? && voice_param.nil?
    return normalized_boolean(sound_param, default: default) if voice_param.nil?
    return normalized_boolean(voice_param, default: default) if sound_param.nil?

    normalized_boolean(sound_param, default: default) && normalized_boolean(voice_param, default: default)
  end

  def normalized_possession_switch_pattern(value, default:)
    candidate = value.presence || default
    return candidate if User::POSSESSION_SWITCH_PATTERNS.key?(candidate)

    User::DEFAULT_POSSESSION_SWITCH_PATTERN
  end

  def normalized_voice_announcement_rate(value, default:)
    candidate = value.presence || default
    rate = candidate.to_f.round(1)
    return rate if User::VOICE_ANNOUNCEMENT_RATES.include?(rate)

    User::DEFAULT_VOICE_ANNOUNCEMENT_RATE
  end
end
