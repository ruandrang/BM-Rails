class ClubMembershipsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, only: [ :update_role, :destroy ]
  before_action :require_club_owner, only: [ :transfer_ownership ]

  def index
    @memberships = @club.club_memberships.includes(:user).order(:role, :joined_at)
  end

  # PATCH /clubs/:club_id/memberships/:id/update_role
  def update_role
    membership = @club.club_memberships.find(params[:id])
    return redirect_with_alert(t("club_memberships.errors.cannot_change_own_role")) if membership.user == current_user
    return redirect_with_alert(t("club_memberships.errors.owner_role_transfer_only")) if membership.owner?

    new_role = params[:role]
    return redirect_with_alert(t("club_memberships.errors.invalid_role")) unless new_role.in?(%w[admin manager member])

    # admin → admin 변경은 owner만 가능
    if new_role == "admin" || membership.admin?
      return redirect_with_alert(t("club_memberships.errors.owner_only_for_admin")) unless @current_membership.owner?
    end

    membership.update!(role: new_role)
    redirect_to club_memberships_path(@club), notice: t("club_memberships.notices.role_changed")
  end

  # PATCH /clubs/:club_id/memberships/transfer_ownership
  def transfer_ownership
    new_owner_membership = @club.club_memberships.find(params[:membership_id])
    return redirect_with_alert(t("club_memberships.errors.cannot_transfer_to_self")) if new_owner_membership.user == current_user

    ActiveRecord::Base.transaction do
      @current_membership.update!(role: "admin")
      new_owner_membership.update!(role: "owner")
    end
    redirect_to club_memberships_path(@club), notice: t("club_memberships.notices.ownership_transferred")
  end

  # DELETE /clubs/:club_id/memberships/:id
  def destroy
    membership = @club.club_memberships.find(params[:id])

    if membership.user == current_user
      # 본인 탈퇴
      return redirect_with_alert(t("club_memberships.errors.owner_cannot_leave")) if membership.owner?
      # Member 연결 해제 (경기 기록 보존)
      @club.members.where(user: current_user).update_all(user_id: nil)
      membership.destroy
      redirect_to clubs_path, notice: t("club_memberships.notices.left_club")
    else
      # 관리자가 추방
      return redirect_with_alert(t("club_memberships.errors.cannot_remove_owner")) if membership.owner?
      # Member 연결 해제 (경기 기록 보존)
      @club.members.where(user: membership.user).update_all(user_id: nil)
      membership.destroy
      redirect_to club_memberships_path(@club), notice: t("club_memberships.notices.member_removed")
    end
  end

  private

  def redirect_with_alert(message)
    redirect_to club_memberships_path(@club), alert: message
  end
end
