module MemberStatsCacheable
  extend ActiveSupport::Concern

  private

  def cached_member_stats(club = nil)
    club ||= @club
    Rails.cache.fetch("club_#{club.id}_member_stats", expires_in: 5.minutes) do
      StatsCalculator.new(club).member_stats
    end
  end

  def expire_member_stats_cache(club = nil)
    club ||= @club
    Rails.cache.delete("club_#{club.id}_member_stats")
  end
end
