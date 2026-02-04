class Admin::ClubsController < Admin::BaseController
  def index
    @clubs = Club.includes(:user).order(:id)
  end

  def show
    @club = Club.includes(:user, :members, :matches).find(params[:id])
  end
end
