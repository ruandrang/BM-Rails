class ClubExporter
  def initialize(club)
    @club = club
  end

  def call
    members = @club.members.order(:sort_order, :id).to_a
    export_ids = {}
    members.each_with_index { |member, index| export_ids[member.id] = index + 1 }

    matches = @club.matches.includes(teams: :members, games: [ :home_team, :away_team ])
                   .order(:played_on, :created_at)

    {
      club: {
        name: @club.name,
        icon: @club.icon
      },
      members: members.map do |member|
        {
          export_id: export_ids[member.id],
          name: member.name,
          age: member.age,
          height_cm: member.height_cm,
          position: member.position,
          jersey_number: member.jersey_number,
          sort_order: member.sort_order
        }
      end,
      matches: matches.map do |match|
        {
          played_on: match.played_on,
          teams_count: match.teams_count,
          note: match.note,
          teams: match.teams.map do |team|
            {
              label: team.label,
              color: team.color,
              member_export_ids: team.members.map { |member| export_ids[member.id] }.compact
            }
          end,
          games: match.games.map do |game|
            {
              home_label: game.home_team.label,
              away_label: game.away_team.label,
              result: game.result
            }
          end
        }
      end
    }
  end
end
