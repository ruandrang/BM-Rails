class Admin::MatchesController < Admin::BaseController
  def index
    @matches = Match.includes(:club).order(played_on: :desc, id: :desc)
  end

  def show
    @match = Match.includes(:club, { teams: :members }, { games: [ :home_team, :away_team ] }).find(params[:id])
  end
end
