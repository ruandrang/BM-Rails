class Admin::MatchesController < Admin::BaseController
  before_action :set_match, only: [ :show, :edit, :update, :destroy ]

  def index
    @matches = paginate(Match.includes(:club).order(played_on: :desc, id: :desc))
  end

  def show
  end

  def edit
  end

  def update
    if @match.update(match_params)
      redirect_to admin_match_path(@match), notice: t("admin.matches.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @match.destroy
    redirect_to admin_matches_path, notice: t("admin.matches.notices.deleted")
  end

  private

  def set_match
    @match = Match.includes(:club, { teams: :members }, { games: [ :home_team, :away_team ] }).find(params[:id])
  end

  def match_params
    params.require(:match).permit(:played_on, :note)
  end
end
