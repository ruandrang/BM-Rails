class Admin::UsersController < Admin::BaseController
  before_action :set_user, only: [ :show, :edit, :update, :toggle_admin, :destroy ]

  def index
    scope = User.order(:id)

    if params[:q].present?
      q = "%#{params[:q]}%"
      scope = scope.where("email LIKE ? OR name LIKE ?", q, q)
    end

    @users = paginate(scope)
  end

  def show
  end

  def edit
  end

  def update
    if @user.update(user_params)
      redirect_to admin_user_path(@user), notice: t("admin.users.notices.updated")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def toggle_admin
    if @user == current_user
      redirect_to admin_user_path(@user), alert: t("admin.users.errors.cannot_change_self")
      return
    end

    @user.update(admin: !@user.admin?)
    redirect_to admin_user_path(@user), notice: t("admin.users.notices.admin_toggled")
  end

  def destroy
    if @user == current_user
      redirect_to admin_users_path, alert: t("admin.users.errors.cannot_delete_self")
      return
    end

    @user.destroy
    redirect_to admin_users_path, notice: t("admin.users.notices.deleted")
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  def user_params
    params.require(:user).permit(:name, :email)
  end
end
