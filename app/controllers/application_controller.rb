class ApplicationController < ActionController::Base
  include MemberStatsCacheable

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern
  before_action :set_locale
  before_action :require_login

  helper_method :current_user, :logged_in?, :current_locale, :available_locale_options

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def logged_in?
    current_user.present?
  end

  def require_login
    return if logged_in?

    redirect_to new_session_path, alert: I18n.t("auth.login_required", default: "로그인이 필요합니다.")
  end

  def require_admin
    return if logged_in? && current_user.admin?

    redirect_to root_path, alert: I18n.t("auth.admin_required", default: "관리자 권한이 필요합니다.")
  end

  def set_locale
    selected = normalized_locale(params[:locale]) || current_user_locale || session_locale || User::DEFAULT_LOCALE
    I18n.locale = selected
    session[:preferred_locale] = selected
  end

  def current_locale
    I18n.locale.to_s
  end

  def available_locale_options
    User::SUPPORTED_LOCALES.map do |code|
      [ I18n.t("language.names.#{code}", default: code), code ]
    end
  end

  def current_user_locale
    return nil unless logged_in?

    normalized_locale(current_user.preferred_locale)
  end

  def session_locale
    normalized_locale(session[:preferred_locale])
  end

  def normalized_locale(value)
    locale = value.to_s.strip
    return nil if locale.blank?

    code = locale.split("-").first.downcase
    User::SUPPORTED_LOCALES.include?(code) ? code : nil
  end
end
