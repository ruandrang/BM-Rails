class Admin::TeamsController < Admin::BaseController
  before_action :set_team, only: [ :show, :edit, :update ]

  def index
    @teams = paginate(Team.includes(match: :club).order(:id))
  end

  def show
  end

  def edit
  end

  def update
    if @team.update(team_params)
      redirect_to admin_team_path(@team), notice: t("admin.teams.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_team
    @team = Team.includes(:members, match: :club).find(params[:id])
  end

  def team_params
    params.require(:team).permit(:label, :color)
  end
end
