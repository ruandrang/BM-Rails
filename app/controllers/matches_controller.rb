class MatchesController < ApplicationController
  before_action :set_club
  before_action :set_match, only: [ :show, :edit, :update, :destroy, :record_results, :share ]

  def index
    @matches = @club.matches.order(played_on: :desc, created_at: :desc)
  end

  def new
    @match = @club.matches.new(played_on: Date.current, teams_count: 2)
    @members = @club.members.order(:sort_order, :id)
  end

  def create
    @match = @club.matches.new(match_params)
    @members = @club.members.order(:sort_order, :id)
    selected_ids = Array(params[:member_ids]).map(&:to_i)
    teams_count = @match.teams_count

    selected_members = @club.members.where(id: selected_ids)
    min_required = teams_count * 2
    max_allowed = teams_count * 6

    if selected_members.size != selected_ids.size
      flash.now[:alert] = "선택한 멤버를 찾을 수 없습니다."
      render :new, status: :unprocessable_entity
      return
    end

    if selected_members.size < min_required
      flash.now[:alert] = "최소 #{min_required}명을 선택해주세요."
      render :new, status: :unprocessable_entity
      return
    end

    if selected_members.size > max_allowed
      flash.now[:alert] = "최대 #{max_allowed}명까지 선택할 수 있습니다."
      render :new, status: :unprocessable_entity
      return
    end

    team_colors = normalize_team_colors(params[:team_colors], teams_count)
    member_stats = Rails.cache.fetch("club_#{@club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(@club).member_stats
    end
    assignments = TeamBalancer.new(selected_members, teams_count, stats: member_stats).call

    ActiveRecord::Base.transaction do
      @match.save!

      labels = %w[A B C]
      teams = teams_count.times.map do |index|
        @match.teams.create!(label: labels[index], color: team_colors[index])
      end

      teams.each_with_index do |team, index|
        assignments[index].each do |member|
          team.team_members.create!(member: member)
        end
      end

      teams.combination(2).each do |home, away|
        @match.games.create!(home_team: home, away_team: away, result: "pending")
      end
    end

    redirect_to club_match_path(@club, @match), notice: "팀이 생성되었습니다."
  rescue StandardError => e
    flash.now[:alert] = "팀 생성에 실패했습니다: #{e.message}"
    render :new, status: :unprocessable_entity
  end

  def show
    @teams = @match.teams.includes(:members).order(:label)
    @games = @match.games.includes(:home_team, :away_team)
  end

  def share
    @teams = @match.teams.includes(:members).order(:label)
    @games = @match.games.includes(:home_team, :away_team)
    render layout: "share"
  end

  def edit
  end

  def update
    if @match.update(match_update_params)
      redirect_to club_match_path(@club, @match), notice: "경기 정보가 수정되었습니다."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @match.destroy
    redirect_to club_matches_path(@club), notice: "경기가 삭제되었습니다."
  end

  def record_results
    results = params[:games] || {}

    ActiveRecord::Base.transaction do
      results.each do |game_id, result|
        game = @match.games.find(game_id)
        next unless Game::RESULTS.include?(result)

        game.update!(result: result)
      end
    end

    redirect_to club_match_path(@club, @match), notice: "경기 결과가 저장되었습니다."
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:club_id])
  end

  def set_match
    @match = @club.matches.find(params[:id])
  end

  def match_params
    params.require(:match).permit(:played_on, :teams_count, :note)
  end

  def match_update_params
    params.require(:match).permit(:played_on, :note)
  end

  def normalize_team_colors(raw_colors, teams_count)
    colors = Array(raw_colors).map { |value| value.to_s.strip }
    colors = colors.first(teams_count)

    while colors.size < teams_count
      colors << Team::COLORS[colors.size % Team::COLORS.size]
    end

    colors.map do |color|
      Team::COLORS.include?(color) ? color : Team::COLORS.first
    end
  end
end
