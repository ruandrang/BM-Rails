# 경기 내 게임 추가/삭제 액션
module MatchGames
  extend ActiveSupport::Concern

  def add_game
    unless @match.teams_count == 2
      return render json: { success: false, error: "2팀 경기에서만 경기 추가가 가능합니다." }, status: :unprocessable_entity
    end

    current_count = @match.games.count
    if current_count >= 3
      total_quarters = 3 * @match.regular_quarters_count
      return render json: { success: false, error: "최대 3게임(총 #{total_quarters}쿼터)까지 추가할 수 있습니다." }, status: :unprocessable_entity
    end

    teams = @match.teams.order(:id).to_a
    unless teams.size == 2
      return render json: { success: false, error: "팀 정보가 올바르지 않습니다." }, status: :unprocessable_entity
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
    render json: { success: false, error: "경기 추가에 실패했습니다." }, status: :unprocessable_entity
  end

  def remove_game
    unless @match.teams_count == 2
      redirect_to club_match_path(@club, @match), alert: "2팀 경기에서만 경기 삭제가 가능합니다."
      return
    end

    current_count = @match.games.count
    if current_count <= 1
      redirect_to club_match_path(@club, @match), alert: "최소 1경기는 유지되어야 합니다."
      return
    end

    game = @match.games.find(params[:game_id])
    if game_started?(game)
      redirect_to club_match_path(@club, @match), alert: "이미 진행된 경기는 삭제할 수 없습니다."
      return
    end

    remaining_count = [ current_count - 1, 1 ].max
    ActiveRecord::Base.transaction do
      game.destroy!
      @match.update!(games_per_match: remaining_count)
    end

    Rails.cache.delete("scoreboard_state_#{@match.id}")
    redirect_to club_match_path(@club, @match), notice: "미진행 경기를 삭제했습니다."
  rescue ActiveRecord::RecordNotFound
    redirect_to club_match_path(@club, @match), alert: "삭제할 경기를 찾을 수 없습니다."
  rescue StandardError => e
    Rails.logger.error("경기 삭제 실패: #{e.class} - #{e.message}")
    redirect_to club_match_path(@club, @match), alert: "경기 삭제에 실패했습니다."
  end
end
