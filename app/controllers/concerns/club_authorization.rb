module ClubAuthorization
  extend ActiveSupport::Concern

  private

  def set_authorized_club
    @club = current_user.clubs.find(params[:club_id] || params[:id])
    @current_membership = @club.membership_for(current_user)
  end

  def require_club_admin
    unless @current_membership&.admin?
      redirect_to club_path(@club), alert: I18n.t("auth.club_admin_required", default: "운영자 권한이 필요합니다.")
    end
  end

  def require_club_owner
    unless @current_membership&.owner?
      redirect_to club_path(@club), alert: I18n.t("auth.club_owner_required", default: "클럽 소유자만 가능합니다.")
    end
  end
end
