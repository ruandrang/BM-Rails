# 경기 내 게임 추가/삭제 액션
module MatchGames
  extend ActiveSupport::Concern

  def add_game
    unless @match.teams_count == 2
      return render json: { success: false, error: t("matches.errors.two_team_only_add") }, status: :unprocessable_entity
    end

    current_count = @match.games.count
    if current_count >= 3
      total_quarters = 3 * @match.regular_quarters_count
      return render json: { success: false, error: t("matches.errors.max_games", quarters: total_quarters) }, status: :unprocessable_entity
    end

    teams = @match.teams.order(:id).to_a
    unless teams.size == 2
      return render json: { success: false, error: t("matches.errors.invalid_teams") }, status: :unprocessable_entity
    end

    game = nil
    new_count = current_count + 1
    ActiveRecord::Base.transaction do
      game = @match.games.create!(home_team: teams[0], away_team: teams[1], result: "pending")
      @match.update!(games_per_match: new_count)
    end

    render json: {
      success: true,
      game: {
        id: game.id,
        home_team_id: game.home_team_id,
        away_team_id: game.away_team_id
      },
      games_per_match: new_count
    }
  rescue StandardError => e
    Rails.logger.error("경기 추가 실패: #{e.class} - #{e.message}")
    render json: { success: false, error: t("matches.errors.add_game_failed") }, status: :unprocessable_entity
  end

  def remove_game
    unless @match.teams_count == 2
      redirect_to club_match_path(@club, @match), alert: t("matches.errors.two_team_only")
      return
    end

    current_count = @match.games.count
    if current_count <= 1
      redirect_to club_match_path(@club, @match), alert: t("matches.errors.min_games")
      return
    end

    game = @match.games.find(params[:game_id])
    if game_started?(game)
      redirect_to club_match_path(@club, @match), alert: t("matches.errors.game_started")
      return
    end

    remaining_count = [ current_count - 1, 1 ].max
    ActiveRecord::Base.transaction do
      game.destroy!
      @match.update!(games_per_match: remaining_count)
    end

    Rails.cache.delete("scoreboard_state_#{@match.id}")
    redirect_to club_match_path(@club, @match), notice: t("matches.notices.game_removed")
  rescue ActiveRecord::RecordNotFound
    redirect_to club_match_path(@club, @match), alert: t("matches.errors.game_not_found")
  rescue StandardError => e
    Rails.logger.error("경기 삭제 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: t("matches.errors.remove_failed")
  end
end
