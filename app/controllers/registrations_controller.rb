class RegistrationsController < ApplicationController
  skip_before_action :require_login

  def new
    @user = User.new
  end

  def create
    @user = User.new(user_params)
    @user.email = @user.email.to_s.downcase.strip

    if @user.save
      session[:user_id] = @user.id
      redirect_to clubs_path, notice: I18n.t("auth.notices.account_created", default: "계정이 생성되었습니다.")
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email, :password, :password_confirmation)
  end
end
