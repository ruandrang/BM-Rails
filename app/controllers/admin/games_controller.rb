class Admin::GamesController < Admin::BaseController
  before_action :set_game, only: [ :show, :edit, :update ]

  def index
    @games = paginate(Game.includes({ match: :club }, :home_team, :away_team).order(:id))
  end

  def show
  end

  def edit
  end

  def update
    if @game.update(game_params)
      redirect_to admin_game_path(@game), notice: t("admin.games.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_game
    @game = Game.includes({ match: :club }, :home_team, :away_team).find(params[:id])
  end

  def game_params
    params.require(:game).permit(:home_score, :away_score, :result)
  end
end
