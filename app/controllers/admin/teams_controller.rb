class Admin::TeamsController < Admin::BaseController
  def index
    @teams = paginate(Team.includes(match: :club).order(:id))
  end

  def show
    @team = Team.includes(:members, match: :club).find(params[:id])
  end
end
