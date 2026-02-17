class SessionsController < ApplicationController
  skip_before_action :require_login
  rate_limit to: 10, within: 1.minute, only: :create

  def new
  end

  def create
    email = params[:email].to_s.downcase.strip
    user = User.find_by(email: email)

    if user&.authenticate(params[:password].to_s)
      session[:user_id] = user.id
      redirect_to clubs_path, notice: I18n.t("auth.notices.logged_in", default: "로그인되었습니다.")
    else
      flash.now[:alert] = I18n.t("auth.errors.invalid_credentials", default: "이메일 또는 비밀번호가 올바르지 않습니다.")
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    reset_session
    redirect_to new_session_path, notice: I18n.t("auth.notices.logged_out", default: "로그아웃되었습니다.")
  end
end
