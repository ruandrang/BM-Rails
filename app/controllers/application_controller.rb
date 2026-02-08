class ApplicationController < ActionController::Base
  include MemberStatsCacheable

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern
  before_action :require_login

  helper_method :current_user, :logged_in?

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def logged_in?
    current_user.present?
  end

  def require_login
    return if logged_in?

    redirect_to new_session_path, alert: "로그인이 필요합니다."
  end

  def require_admin
    return if logged_in? && current_user.admin?

    redirect_to root_path, alert: "관리자 권한이 필요합니다."
  end
end
