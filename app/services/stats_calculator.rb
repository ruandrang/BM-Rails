class StatsCalculator
  def initialize(club)
    @club = club
  end

  def member_stats(period: nil)
    members = @club.members.to_a
    stats = Hash.new { |hash, key| hash[key] = { games: 0, wins: 0, draws: 0, losses: 0 } }

    team_members = TeamMember.includes(team: { match: :games }).where(member_id: members.map(&:id))

    team_members.each do |team_member|
      team = team_member.team
      match = team.match

      # 기간 필터링
      if period.present?
        next unless period.cover?(match.played_on)
      end

      match.games.each do |game|
        next unless [ game.home_team_id, game.away_team_id ].include?(team.id)
        next if game.result == "pending"

        stats[team_member.member_id][:games] += 1

        case game.result
        when "draw"
          stats[team_member.member_id][:draws] += 1
        when "home_win"
          if game.home_team_id == team.id
            stats[team_member.member_id][:wins] += 1
          else
            stats[team_member.member_id][:losses] += 1
          end
        when "away_win"
          if game.away_team_id == team.id
            stats[team_member.member_id][:wins] += 1
          else
            stats[team_member.member_id][:losses] += 1
          end
        end
      end
    end

    members.map do |member|
      record = stats[member.id]
      games = record[:games]
      win_rate = games.positive? ? (record[:wins].to_f / games) : 0.0

      record.merge(member: member, win_rate: win_rate)
    end
  end
end
