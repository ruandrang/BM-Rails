class ClubImporter
  def initialize(club, payload)
    @club = club
    @payload = payload
    @stats = { members_added: 0, members_skipped: 0, matches_added: 0, matches_skipped: 0 }
  end

  def call
    ActiveRecord::Base.transaction do
      update_club_info!
      merge_members!
      merge_matches!
    end
    @stats
  end

  private

  def update_club_info!
    validate_payload!

    club_data = @payload.fetch("club")
    icon = Club::ICONS.include?(club_data["icon"]) ? club_data["icon"] : Club::ICONS.first
    @club.update!(name: club_data["name"], icon: icon)
  end

  def validate_payload!
    club_data = @payload["club"]
    raise ArgumentError, "club 데이터가 필요합니다" unless club_data
    raise ArgumentError, "클럽 이름이 필요합니다" if club_data["name"].blank?

    Array(@payload["members"]).each_with_index do |member, idx|
      raise ArgumentError, "멤버 #{idx + 1}의 이름이 필요합니다" if member["name"].blank?
    end

    Array(@payload["matches"]).each_with_index do |match, idx|
      raise ArgumentError, "경기 #{idx + 1}의 날짜가 필요합니다" if match["played_on"].blank?
      teams_count = (match["teams_count"] || 2).to_i
      raise ArgumentError, "경기 #{idx + 1}의 팀 수가 올바르지 않습니다" unless [ 2, 3 ].include?(teams_count)

      games_per_match = normalize_games_per_match(teams_count, match["games_per_match"])
      unless (teams_count == 3 && games_per_match == 1) || (teams_count == 2 && (1..3).include?(games_per_match))
        raise ArgumentError, "경기 #{idx + 1}의 2팀 경기 수 설정이 올바르지 않습니다"
      end
    end
  end

  # 이름 기준으로 기존 멤버와 비교하여 새 멤버만 추가
  def merge_members!
    @member_map = {}
    existing_members = @club.members.index_by { |m| m.name.to_s.strip.downcase }
    next_order = @club.members.maximum(:sort_order).to_i + 1

    Array(@payload["members"]).each do |member_data|
      name_key = member_data["name"].to_s.strip.downcase
      existing = existing_members[name_key]

      if existing
        @member_map[member_data["export_id"]] = existing
        @stats[:members_skipped] += 1
      else
        position = Member::POSITIONS.include?(member_data["position"]) ? member_data["position"] : Member::POSITIONS.first
        member = @club.members.create!(
          name: member_data["name"],
          age: member_data["age"],
          height_cm: member_data["height_cm"],
          position: position,
          jersey_number: member_data["jersey_number"],
          sort_order: next_order
        )
        next_order += 1
        @member_map[member_data["export_id"]] = member
        existing_members[name_key] = member
        @stats[:members_added] += 1
      end
    end
  end

  # 날짜 + 팀 수 + 참가 선수 구성으로 기존 경기와 비교하여 새 경기만 추가
  def merge_matches!
    existing_fingerprints = build_existing_match_fingerprints

    Array(@payload["matches"]).each do |match_data|
      fingerprint = build_import_match_fingerprint(match_data)

      if existing_fingerprints.include?(fingerprint)
        @stats[:matches_skipped] += 1
        next
      end

      create_match_from_data!(match_data)
      existing_fingerprints << fingerprint
      @stats[:matches_added] += 1
    end
  end

  # 기존 경기들의 지문(fingerprint) 생성: "날짜|팀수|정렬된_멤버이름들"
  def build_existing_match_fingerprints
    fingerprints = Set.new

    @club.matches.includes(teams: :members).each do |match|
      member_names = match.teams.flat_map { |t| t.members.map { |m| m.name.to_s.strip.downcase } }.sort
      fingerprints << "#{match.played_on}|#{match.teams_count}|#{match.games_per_match}|#{member_names.join(',')}"
    end

    fingerprints
  end

  # import 대상 경기의 지문 생성
  def build_import_match_fingerprint(match_data)
    played_on = match_data["played_on"]
    teams_count = (match_data["teams_count"] || 2).to_i
    games_per_match = normalize_games_per_match(teams_count, match_data["games_per_match"])

    member_names = Array(match_data["teams"]).flat_map do |team_data|
      Array(team_data["member_export_ids"]).filter_map do |export_id|
        @member_map[export_id]&.name&.to_s&.strip&.downcase
      end
    end.sort

    "#{played_on}|#{teams_count}|#{games_per_match}|#{member_names.join(',')}"
  end

  def create_match_from_data!(match_data)
    teams_count = (match_data["teams_count"] || 2).to_i
    games_per_match = normalize_games_per_match(teams_count, match_data["games_per_match"])

    match = @club.matches.create!(
      played_on: match_data["played_on"],
      teams_count: teams_count,
      games_per_match: games_per_match,
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
      match.games.create!(
        home_team: home_team,
        away_team: away_team,
        result: result,
        home_score: game_data["home_score"].to_i,
        away_score: game_data["away_score"].to_i,
        quarter_scores: game_data["quarter_scores"]
      )
    end
  end

  def normalize_games_per_match(teams_count, raw_value)
    value = raw_value.to_i
    value = 1 if value <= 0
    return 1 if teams_count.to_i == 3

    [ value, 3 ].min
  end
end
