class Admin::TeamMembersController < Admin::BaseController
  def index
    @team_members = TeamMember.includes(:team, :member).order(:id)
  end

  def show
    @team_member = TeamMember.includes(:team, :member).find(params[:id])
  end
end
