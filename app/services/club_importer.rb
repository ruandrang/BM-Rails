class ClubImporter
  def initialize(club, payload)
    @club = club
    @payload = payload
  end

  def call
    ActiveRecord::Base.transaction do
      import_club!
      import_members!
      import_matches!
    end
  end

  private

  def import_club!
    club_data = @payload.fetch("club")
    icon = Club::ICONS.include?(club_data["icon"]) ? club_data["icon"] : Club::ICONS.first

    validate_payload!

    @club.matches.destroy_all
    @club.members.destroy_all

    @club.update!(
      name: club_data["name"],
      icon: icon
    )
  end

  def validate_payload!
    club_data = @payload["club"]
    raise ArgumentError, "club 데이터가 필요합니다" unless club_data
    raise ArgumentError, "클럽 이름이 필요합니다" if club_data["name"].blank?

    Array(@payload["members"]).each_with_index do |member, idx|
      raise ArgumentError, "멤버 #{idx + 1}의 이름이 필요합니다" if member["name"].blank?
    end
  end

  def import_members!
    @member_map = {}
    Array(@payload["members"]).each do |member_data|
      position = Member::POSITIONS.include?(member_data["position"]) ? member_data["position"] : Member::POSITIONS.first
      member = @club.members.create!(
        name: member_data["name"],
        age: member_data["age"],
        height_cm: member_data["height_cm"],
        position: position,
        jersey_number: member_data["jersey_number"],
        sort_order: member_data["sort_order"].to_i
      )
      @member_map[member_data["export_id"]] = member
    end
  end

  def import_matches!
    Array(@payload["matches"]).each do |match_data|
      match = @club.matches.create!(
        played_on: match_data["played_on"],
        teams_count: (match_data["teams_count"] || 2).to_i,
        note: match_data["note"]
      )

      team_map = {}
      Array(match_data["teams"]).each do |team_data|
        color = Team::COLORS.include?(team_data["color"]) ? team_data["color"] : Team::COLORS.first
        label = team_data["label"].presence || "A"
        team = match.teams.create!(label: label, color: color)
        team_map[label] = team

        Array(team_data["member_export_ids"]).each do |export_id|
          member = @member_map[export_id]
          team.team_members.create!(member: member) if member
        end
      end

      Array(match_data["games"]).each do |game_data|
        home_team = team_map[game_data["home_label"]]
        away_team = team_map[game_data["away_label"]]
        next unless home_team && away_team

        result = Game::RESULTS.include?(game_data["result"]) ? game_data["result"] : "pending"
        match.games.create!(home_team: home_team, away_team: away_team, result: result)
      end
    end
  end
end
