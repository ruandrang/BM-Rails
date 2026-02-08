class Admin::GamesController < Admin::BaseController
  def index
    @games = paginate(Game.includes({ match: :club }, :home_team, :away_team).order(:id))
  end

  def show
    @game = Game.includes({ match: :club }, :home_team, :away_team).find(params[:id])
  end
end
