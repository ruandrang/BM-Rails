class TeamBalancer
  def initialize(members, teams_count, stats:)
    @members = members.to_a
    @teams_count = teams_count
    @stats = stats.index_by { |row| row[:member].id }
  end

  def call
    teams = Array.new(@teams_count) do
      { members: [], positions: Hash.new(0), strength_total: 0.0 }
    end

    strengths = build_strengths

    Member::POSITIONS.each do |position|
      group = @members.select { |member| member.position == position }
      group.sort_by { |member| -strengths[member.id] }.each do |member|
        assign_member(teams, member, position, strengths[member.id])
      end
    end

    unknown = @members.reject { |member| Member::POSITIONS.include?(member.position) }
    unknown.each do |member|
      assign_member(teams, member, "Unknown", strengths[member.id])
    end

    teams.map { |team| team[:members] }
  end

  private

  def build_strengths
    strengths = {}
    @members.each do |member|
      stat = @stats[member.id] || {}
      games = stat[:games].to_i
      win_rate = stat[:win_rate].to_f
      strengths[member.id] = games >= 5 ? win_rate : 0.5
    end
    strengths
  end

  def assign_member(teams, member, position, strength)
    team = teams.min_by do |team_data|
      [
        team_data[:positions][position],
        team_data[:members].size,
        team_data[:strength_total]
      ]
    end

    team[:members] << member
    team[:positions][position] += 1
    team[:strength_total] += strength
  end
end
