class Admin::TeamMembersController < Admin::BaseController
  def index
    @team_members = paginate(TeamMember.includes({ team: { match: :club } }, :member).order(:id))
  end

  def show
    @team_member = TeamMember.includes({ team: { match: :club } }, :member).find(params[:id])
  end
end
