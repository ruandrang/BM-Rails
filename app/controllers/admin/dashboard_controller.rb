class Admin::DashboardController < Admin::BaseController
  def index
    @stats = {
      users: User.count,
      clubs: Club.count,
      members: Member.count,
      matches: Match.count,
      teams: Team.count,
      team_members: TeamMember.count,
      games: Game.count
    }
  end
end
