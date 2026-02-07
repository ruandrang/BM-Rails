class StatsController < ApplicationController
  before_action :set_club

  def index
    stats = Rails.cache.fetch("club_#{@club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(@club).member_stats
    end

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
