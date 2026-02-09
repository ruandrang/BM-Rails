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
    expire_monthly_member_stats_cache(club)
  end

  def expire_monthly_member_stats_cache(club)
    Rails.cache.delete_matched(/\Aclub_#{club.id}_monthly_stats_/)
  rescue NotImplementedError
    # Some cache stores do not support delete_matched.
  end
end
