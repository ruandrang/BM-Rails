class Admin::ClubsController < Admin::BaseController
  before_action :set_club, only: [ :show, :edit, :update, :destroy ]

  def index
    scope = Club.includes(:user).order(:id)

    if params[:q].present?
      q = "%#{params[:q]}%"
      scope = scope.where("clubs.name LIKE ?", q)
    end

    @clubs = paginate(scope)
  end

  def show
  end

  def edit
  end

  def update
    if @club.update(club_params)
      redirect_to admin_club_path(@club), notice: t("admin.clubs.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @club.destroy
    redirect_to admin_clubs_path, notice: t("admin.clubs.notices.deleted")
  end

  private

  def set_club
    @club = Club.includes(:user, :members, :matches).find(params[:id])
  end

  def club_params
    params.require(:club).permit(:name, :icon, :description, meeting_days: [])
  end
end
