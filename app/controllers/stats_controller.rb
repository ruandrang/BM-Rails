class StatsController < ApplicationController
  before_action :set_club

  def index
    calculator = StatsCalculator.new(@club)
    stats = calculator.member_stats

    @sort = params[:sort].presence || "name"
    @stats = case @sort
             when "games"
               stats.sort_by { |row| -row[:games] }
             when "win_rate"
               stats.sort_by { |row| -row[:win_rate] }
             else
               stats.sort_by { |row| row[:member].name.to_s }
             end
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:club_id])
  end
end
