class StatsController < ApplicationController
  before_action :set_club

  def index
    # 데이터 변경 감지를 위한 캐시 키 생성 (최근 경기 수정 시간)
    last_update = @club.matches.maximum(:updated_at).to_i

    # 전체 통계
    stats = Rails.cache.fetch("club_#{@club.id}_member_stats_#{last_update}", expires_in: 1.hour) do
      StatsCalculator.new(@club).member_stats
    end

    # 월간 MVP (지난달 기준)
    last_month = 1.month.ago
    month_range = last_month.beginning_of_month..last_month.end_of_month

    monthly_stats = Rails.cache.fetch("club_#{@club.id}_monthly_stats_#{last_month.strftime('%Y%m')}_#{last_update}", expires_in: 1.hour) do
      StatsCalculator.new(@club).member_stats(period: month_range)
    end

    # 경기 수가 0보다 큰 멤버 중에서 승률 1위, 승률 같으면 경기 수 많은 순
    @monthly_mvp = monthly_stats.select { |s| s[:games] > 0 }
                                .sort_by { |s| [ -s[:win_rate], -s[:games] ] }
                                .first
    @mvp_month = last_month.month

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
