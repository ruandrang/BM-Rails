class SettingsController < ApplicationController
  def show
    @user = current_user
  end

  def update
    @user = current_user
    minutes = normalized_default_game_minutes

    unless minutes
      @user.assign_attributes(setting_params)
      @user.errors.add(:default_game_minutes, "는 #{User::MIN_GAME_MINUTES}~#{User::MAX_GAME_MINUTES}분 사이여야 합니다.")
      render :show, status: :unprocessable_entity
      return
    end

    @user.update_columns(default_game_minutes: minutes, updated_at: Time.current)
    clear_scoreboard_state_cache!
    redirect_to setting_path, notice: "세팅이 저장되었습니다."
  end

  private

  def setting_params
    params.require(:user).permit(:default_game_minutes)
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
end
