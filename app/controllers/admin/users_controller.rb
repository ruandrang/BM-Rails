class Admin::UsersController < Admin::BaseController
  def index
    @users = User.order(:id)
  end

  def show
    @user = User.find(params[:id])
  end
end
